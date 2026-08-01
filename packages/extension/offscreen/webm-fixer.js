/**
 * webm-fixer.js
 *
 * Re-muxes WebM files produced by MediaRecorder to inject missing metadata:
 * 1. Duration in the Segment Info section.
 * 2. Cues index table (mapping keyframe timestamps to byte offsets relative to Segment data).
 *
 * This allows video/audio players (VLC, QuickTime, browsers) to show exact duration
 * and support seeking/scrubbing across the timeline.
 */

(function (global) {
    'use strict';

    // ─── EBML Constants ───
    const ID_EBML = 0x1A45DFA3;
    const ID_SEGMENT = 0x18538067;
    const ID_INFO = 0x1549A966;
    const ID_TIMECODESCALE = 0x2AD7B1;
    const ID_DURATION = 0x4489;
    const ID_CLUSTER = 0x1F43B675;
    const ID_CLUSTER_TIMECODE = 0xE7;
    const ID_SIMPLEBLOCK = 0xA3;
    const ID_CUES = 0x4C537046;
    const ID_CUEPOINT = 0xBB;
    const ID_CUETIME = 0xB3;
    const ID_CUETRACKPOSITIONS = 0xB7;
    const ID_CUETRACK = 0xF7;
    const ID_CUECLUSTERPOSITION = 0xF1;

    // ─── EBML Reader / Binary Utilities ───

    function readVint(buffer, offset) {
        if (offset >= buffer.byteLength) return null;
        const firstByte = buffer[offset];
        if (firstByte === 0) return null;

        let numBytes = 1;
        let mask = 0x80;
        while ((firstByte & mask) === 0 && numBytes <= 8) {
            mask >>= 1;
            numBytes++;
        }
        if (numBytes > 8 || offset + numBytes > buffer.byteLength) return null;

        let value = firstByte & (mask - 1);
        for (let i = 1; i < numBytes; i++) {
            value = (value * 256) + buffer[offset + i];
        }

        return { length: numBytes, value: value };
    }

    function readEbmlId(buffer, offset) {
        if (offset >= buffer.byteLength) return null;
        const firstByte = buffer[offset];
        let numBytes = 1;
        let mask = 0x80;
        while ((firstByte & mask) === 0 && numBytes <= 4) {
            mask >>= 1;
            numBytes++;
        }
        if (numBytes > 4 || offset + numBytes > buffer.byteLength) return null;

        let id = 0;
        for (let i = 0; i < numBytes; i++) {
            id = (id * 256) + buffer[offset + i];
        }

        return { length: numBytes, id: id };
    }

    function readUint(buffer, offset, length) {
        let val = 0;
        for (let i = 0; i < length; i++) {
            val = (val * 256) + buffer[offset + i];
        }
        return val;
    }

    function readFloat64(buffer, offset) {
        const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
        return view.getFloat64(0, false); // Big endian
    }

    function readFloat32(buffer, offset) {
        const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
        return view.getFloat32(0, false);
    }

    function encodeVint(value, minWidth = 1) {
        let numBytes = 1;
        let limit = 127;
        while (value > limit && numBytes < 8) {
            numBytes++;
            limit = (1 << (7 * numBytes)) - 1;
        }
        if (minWidth > numBytes) numBytes = minWidth;

        const bytes = new Uint8Array(numBytes);
        let val = value;
        for (let i = numBytes - 1; i > 0; i--) {
            bytes[i] = val & 0xFF;
            val = Math.floor(val / 256);
        }
        const marker = 1 << (8 - numBytes);
        bytes[0] = (val & (marker - 1)) | marker;
        return bytes;
    }

    function encodeEbmlId(id) {
        let numBytes = 4;
        if ((id & 0xFFFFFF00) === 0) numBytes = 1;
        else if ((id & 0xFFFF0000) === 0) numBytes = 2;
        else if ((id & 0xFF000000) === 0) numBytes = 3;

        const bytes = new Uint8Array(numBytes);
        let val = id;
        for (let i = numBytes - 1; i >= 0; i--) {
            bytes[i] = val & 0xFF;
            val >>= 8;
        }
        return bytes;
    }

    function encodeUint(value) {
        if (value === 0) return new Uint8Array([0]);
        const bytes = [];
        let val = value;
        while (val > 0) {
            bytes.unshift(val & 0xFF);
            val = Math.floor(val / 256);
        }
        return new Uint8Array(bytes);
    }

    function encodeFloat64(value) {
        const buf = new ArrayBuffer(8);
        const view = new DataView(buf);
        view.setFloat64(0, value, false); // Big endian
        return new Uint8Array(buf);
    }

    function createEbmlElement(id, payload) {
        const idBytes = encodeEbmlId(id);
        const sizeBytes = encodeVint(payload.length);
        const result = new Uint8Array(idBytes.length + sizeBytes.length + payload.length);
        result.set(idBytes, 0);
        result.set(sizeBytes, idBytes.length);
        result.set(payload, idBytes.length + sizeBytes.length);
        return result;
    }

    // ─── Main Fixer Function ───

    /**
     * Fixes a WebM blob by embedding Duration metadata and generating a Cues index element.
     * @param {Blob} blob - Raw WebM Blob from MediaRecorder
     * @param {number} [targetDurationMs] - Optional target duration in milliseconds
     * @returns {Promise<Blob>} Corrected WebM Blob
     */
    async function fixWebmDurationAndCues(blob, targetDurationMs) {
        try {
            const arrayBuffer = await blob.arrayBuffer();
            const u8 = new Uint8Array(arrayBuffer);

            let pos = 0;
            let segmentOffset = null;
            let segmentDataOffset = null;
            let segmentDataSize = null;

            let infoOffset = null;
            let infoSize = null;
            let timecodeScale = 1_000_000; // Default 1ms (in ns)
            let existingDurationMs = 0;

            const keyframes = []; // { timecode, track, clusterSegmentOffset }
            let maxTimecode = 0;
            let firstClusterPos = null;

            // Step 1: Scan top-level elements (EBML, Segment)
            while (pos < u8.length) {
                const ebmlId = readEbmlId(u8, pos);
                if (!ebmlId) break;
                const sizeVint = readVint(u8, pos + ebmlId.length);
                if (!sizeVint) break;

                const elemHeaderLen = ebmlId.length + sizeVint.length;
                const elemDataSize = sizeVint.value;

                if (ebmlId.id === ID_SEGMENT) {
                    segmentOffset = pos;
                    segmentDataOffset = pos + elemHeaderLen;
                    segmentDataSize = elemDataSize;
                    pos = segmentDataOffset;
                    break;
                }

                pos += elemHeaderLen + elemDataSize;
            }

            if (segmentDataOffset === null) {
                console.warn('[webm-fixer] Could not find Segment element; returning original blob.');
                return blob;
            }

            // Step 2: Scan inside Segment for Info, Tracks, Clusters
            pos = segmentDataOffset;
            const segmentEnd = (segmentDataSize !== null && segmentDataSize < 0x01FFFFFFFFFFFFFF)
                ? segmentDataOffset + segmentDataSize
                : u8.length;

            while (pos < segmentEnd && pos < u8.length) {
                const ebmlId = readEbmlId(u8, pos);
                if (!ebmlId) break;
                const sizeVint = readVint(u8, pos + ebmlId.length);
                if (!sizeVint) break;

                const elemHeaderLen = ebmlId.length + sizeVint.length;
                const elemDataSize = sizeVint.value;
                const elemDataPos = pos + elemHeaderLen;

                if (ebmlId.id === ID_INFO) {
                    infoOffset = pos;
                    infoSize = elemHeaderLen + elemDataSize;

                    // Read TimecodeScale & Duration inside Info
                    let iPos = elemDataPos;
                    const iEnd = elemDataPos + elemDataSize;
                    while (iPos < iEnd && iPos < u8.length) {
                        const iId = readEbmlId(u8, iPos);
                        if (!iId) break;
                        const iSize = readVint(u8, iPos + iId.length);
                        if (!iSize) break;
                        const iDataPos = iPos + iId.length + iSize.length;

                        if (iId.id === ID_TIMECODESCALE) {
                            timecodeScale = readUint(u8, iDataPos, iSize.value);
                        } else if (iId.id === ID_DURATION) {
                            if (iSize.value === 8) existingDurationMs = readFloat64(u8, iDataPos);
                            else if (iSize.value === 4) existingDurationMs = readFloat32(u8, iDataPos);
                        }
                        iPos = iDataPos + iSize.value;
                    }
                } else if (ebmlId.id === ID_CLUSTER) {
                    if (firstClusterPos === null) {
                        firstClusterPos = pos;
                    }

                    const clusterSegmentOffset = pos - segmentDataOffset;
                    let clusterTimecode = 0;

                    // Scan inside Cluster for ClusterTimecode and SimpleBlocks
                    let cPos = elemDataPos;
                    const cEnd = (elemDataSize < 0x01FFFFFFFFFFFFFF) ? elemDataPos + elemDataSize : segmentEnd;

                    while (cPos < cEnd && cPos < u8.length) {
                        const cId = readEbmlId(u8, cPos);
                        if (!cId) break;
                        const cSize = readVint(u8, cPos + cId.length);
                        if (!cSize) break;
                        const cDataPos = cPos + cId.length + cSize.length;

                        if (cId.id === ID_CLUSTER_TIMECODE) {
                            clusterTimecode = readUint(u8, cDataPos, cSize.value);
                            if (clusterTimecode > maxTimecode) maxTimecode = clusterTimecode;
                        } else if (cId.id === ID_SIMPLEBLOCK) {
                            // SimpleBlock: Track number (VINT), Timecode (int16), Flags (uint8)
                            const trackVint = readVint(u8, cDataPos);
                            if (trackVint) {
                                const trackNum = trackVint.value;
                                const blockTimecodeOffset = (u8[cDataPos + trackVint.length] << 8) | u8[cDataPos + trackVint.length + 1];
                                const relTimecode = (blockTimecodeOffset & 0x8000) ? (blockTimecodeOffset - 0x10000) : blockTimecodeOffset;
                                const flags = u8[cDataPos + trackVint.length + 2];
                                const isKeyframe = (flags & 0x80) !== 0;

                                const absTimecode = clusterTimecode + relTimecode;
                                if (absTimecode > maxTimecode) maxTimecode = absTimecode;

                                if (isKeyframe) {
                                    keyframes.push({
                                        timecode: clusterTimecode,
                                        track: trackNum,
                                        clusterSegmentOffset: clusterSegmentOffset
                                    });
                                }
                            }
                        }

                        cPos = cDataPos + cSize.value;
                    }
                }

                pos = elemDataPos + elemDataSize;
            }

            // Step 3: Determine final duration in ms
            const timecodeScaleMs = timecodeScale / 1_000_000;
            const computedStreamDurationMs = maxTimecode * timecodeScaleMs;

            let finalDurationMs = targetDurationMs || computedStreamDurationMs || existingDurationMs || 0;
            if (finalDurationMs < computedStreamDurationMs) {
                finalDurationMs = computedStreamDurationMs;
            }

            const durationInScaleUnits = finalDurationMs / timecodeScaleMs;

            // Step 4: Build Info element payload with Duration
            const infoPayloadParts = [];
            infoPayloadParts.push(createEbmlElement(ID_TIMECODESCALE, encodeUint(timecodeScale)));
            infoPayloadParts.push(createEbmlElement(ID_DURATION, encodeFloat64(durationInScaleUnits)));

            const newInfoElement = createEbmlElement(ID_INFO, combineUint8Arrays(infoPayloadParts));

            // Step 5: Build Cues element payload
            const uniqueKeyframes = [];
            const seenOffsets = new Set();
            for (const kf of keyframes) {
                if (!seenOffsets.has(kf.clusterSegmentOffset)) {
                    seenOffsets.add(kf.clusterSegmentOffset);
                    uniqueKeyframes.push(kf);
                }
            }

            const cuePointElements = [];
            for (const kf of uniqueKeyframes) {
                const cueTimeElem = createEbmlElement(ID_CUETIME, encodeUint(kf.timecode));
                const cueTrackElem = createEbmlElement(ID_CUETRACK, encodeUint(kf.track));
                const cuePosElem = createEbmlElement(ID_CUECLUSTERPOSITION, encodeUint(kf.clusterSegmentOffset));

                const cueTrackPositionsElem = createEbmlElement(ID_CUETRACKPOSITIONS, combineUint8Arrays([cueTrackElem, cuePosElem]));
                const cuePointElem = createEbmlElement(ID_CUEPOINT, combineUint8Arrays([cueTimeElem, cueTrackPositionsElem]));
                cuePointElements.push(cuePointElem);
            }

            const cuesElement = createEbmlElement(ID_CUES, combineUint8Arrays(cuePointElements));

            // Step 6: Reconstruct WebM Uint8Array
            const newParts = [];

            if (infoOffset !== null) {
                newParts.push(u8.subarray(0, infoOffset));
                newParts.push(newInfoElement);
                newParts.push(u8.subarray(infoOffset + infoSize));
            } else {
                newParts.push(u8.subarray(0, segmentDataOffset));
                newParts.push(newInfoElement);
                newParts.push(u8.subarray(segmentDataOffset));
            }

            newParts.push(cuesElement);

            const finalBuffer = combineUint8Arrays(newParts);

            // Update Segment Size in finalBuffer header if needed
            const segEbmlId = readEbmlId(finalBuffer, segmentOffset);
            if (segEbmlId) {
                const segSizeVint = readVint(finalBuffer, segmentOffset + segEbmlId.length);
                if (segSizeVint) {
                    const newSegmentDataSize = finalBuffer.length - (segmentOffset + segEbmlId.length + segSizeVint.length);
                    const encodedNewSize = encodeVint(newSegmentDataSize, segSizeVint.length);
                    if (encodedNewSize.length === segSizeVint.length) {
                        finalBuffer.set(encodedNewSize, segmentOffset + segEbmlId.length);
                    }
                }
            }

            console.log(`[webm-fixer] Successfully fixed WebM! Duration: ${(finalDurationMs / 1000).toFixed(2)}s, Cues points: ${uniqueKeyframes.length}`);
            return new Blob([finalBuffer], { type: blob.type || 'video/webm' });
        } catch (err) {
            console.error('[webm-fixer] Failed to fix WebM metadata:', err);
            return blob; // Return original blob as fallback
        }
    }

    function combineUint8Arrays(arrays) {
        let totalLen = 0;
        for (const arr of arrays) totalLen += arr.length;
        const result = new Uint8Array(totalLen);
        let offset = 0;
        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }
        return result;
    }

    // Export to global scope
    global.fixWebmDurationAndCues = fixWebmDurationAndCues;

})(typeof self !== 'undefined' ? self : this);
