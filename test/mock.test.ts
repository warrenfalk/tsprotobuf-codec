import { writable } from "./mock";

describe('mock writer', () => {
    test('write consumes space', () => {
        const w = writable();
        w.writeByte(1);
        expect(w.count()).toBe(1);
    })
    
    test('write is readable as string', () => {
        const rw = writable();
        rw.writeByte(1);
        rw.writeByte(16);
        expect(rw.toHexString()).toBe("0110");
    })
    
    test('write byte value out of range throws', () => {
        const w = writable();
        expect(() => w.writeByte(-1)).toThrow(/range/);
        expect(() => w.writeByte(256)).toThrow(/range/);
    })
    
    test('write begin and end', () => {
        const w = writable();
        w.begin();
        w.writeByte(1);
        w.writeByte(2);
        w.writeByte(3);
        w.end();
        expect(w.toHexString()).toBe("03010203");
    })
    
    test('write begin and end nested twice', () => {
        const w = writable();
        w.begin();
        w.writeByte(1);
        w.begin();
        w.writeByte(2);
        w.end();
        w.writeByte(3);
        w.end();
        expect(w.toHexString()).toBe("0401010203");
    })
    
    test('end without begin throws', () => {
        const w = writable();
        w.begin();
        w.writeByte(1);
        w.end();
        expect(() => w.end()).toThrow(/without/i)
    })
})
