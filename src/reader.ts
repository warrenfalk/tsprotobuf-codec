import { Readable } from "./types";

export const fromBytes: (bytes: Uint8Array) => Readable
= (bytes) => {
    let cursor = 0;
    function readBlock(length: number) {
        const block = bytes.subarray(cursor, cursor + length);
        cursor += length;
        return block;
    }
    return {
        isDone: () => cursor >= bytes.length,
        readByte: () => bytes[cursor++],
        readBlock: readBlock,
        subreader: (length: number) => fromBytes(readBlock(length)),
    }
}
