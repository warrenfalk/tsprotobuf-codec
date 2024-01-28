import { fromHex, hexToBytes } from "./functions"

describe('fromHex', () => {
    it('returns a readable', () => {
        const r = fromHex("01");
        expect(r.readBlock).toBeDefined();
        expect(r.readByte()).toBe(1);
        expect(r.subreader).toBeDefined();
    })
})

describe('hexToBytes', () => {
    it('converts hex to bytes', () => {
        const b = hexToBytes("02");
        expect(Array.from(b)).toStrictEqual([2]);
    })

    it('converts empty string to empty bytes', () => {
        const b = hexToBytes("");
        expect(Array.from(b)).toStrictEqual([]);
    })
})