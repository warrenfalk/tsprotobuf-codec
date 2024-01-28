import { Reader } from "../src/protobuf-codec-ts";
import { hexToBytes } from "./functions";

describe('Reader', () => {
    test('reader.readByte() reads bytes with undefined at end', () => {
        const r = Reader.fromBytes(hexToBytes("87ad4b"));
        expect(r.readByte()).toBe(0x87);
        expect(r.readByte()).toBe(0xad);
        expect(r.readByte()).toBe(0x4b);
        expect(r.readByte()).not.toBeDefined();
    })

    test('reader.toBlob() returns expected bytes', () => {
        const r = Reader.fromBytes(hexToBytes("87ad4b"));
    })
})
