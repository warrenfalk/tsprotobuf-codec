import { Reader } from "../src/protobuf-codec-ts";
import { Readable } from "../src/types";

export const hexToBytes: (hex: string) => Uint8Array
= (hex) => {
    const pairs = hex.replace(/\s+/g, "").match(/.{1,2}/g) || []
    return new Uint8Array(pairs.map(pair => parseInt(pair, 16)));
}

export const fromHex: (hex: string) => Readable
= (hex) => {
    return Reader.fromBytes(hexToBytes(hex));
}

