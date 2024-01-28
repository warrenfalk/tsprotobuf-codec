import * as join from "../src/join64"

test('join unsigned decimal above built in conversion', () => {
    expect(join.unsignedDecimal(0, 0x200000)).toBe("9007199254740992");
})

test('join unsigned decimal with 7 trailing zeros', () => {
    expect(join.unsignedDecimal(0x503f00, 0x200000)).toBe("9007199260000000");
})

test('join unsigned decimal with 7 trailing zeros', () => {
    expect(join.unsignedDecimal(0xdb74c000, 0x205466)).toBe("9100000000000000");
})
