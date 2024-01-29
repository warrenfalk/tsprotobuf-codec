import { FieldTypes } from '../src/protobuf-codec-ts';
import { fromHex } from './functions';
import { message, createMessage, MessageFieldDef, MessageDef, define } from '../src/messages';
import { WireType } from '../src/types';

describe('message', () => {
    it('can defer evaluation of message def object', () => {
        const orig = (() => ({v: "one"})) as any;
        const d = {readMessageValue: orig}
        const msg = message(() => d);
        const after = (() => ({v: "two"})) as any;
        d.readMessageValue = after;
        expect(d.readMessageValue).toBe(after);
        const v = msg.readValue(fromHex(``));
        expect(v).toStrictEqual({v: "two"});
    })
})

describe('define', () => {
    const placeholder: any = {};
    const def = {
        writeContents: () => {},
        fields: [],
    };
    define(placeholder, def);

    it('has the expected properties/methods', () => {
        expect(placeholder.writeContents).toBe(def.writeContents);
        expect(placeholder.fields).toBe(def.fields);
        expect(placeholder.writeValue).toBeDefined();
        expect(placeholder.write).toBeDefined();
        expect(placeholder.encode).toBeDefined();
        expect(placeholder.readMessageValue).toBeDefined();
        expect(placeholder.readValue).toBeDefined();
        expect(placeholder.defVal).toBeDefined();
        expect(placeholder.read).toBeDefined();
        expect(placeholder.wireType).toBeDefined();
        expect(placeholder.decode).toBeDefined();
        //expect(placeholder.create).toBeDefined();
    })

    test.todo("test that create is populated");
})

describe('createMessage', () => {
    type Msg = {readonly strVal: string, readonly otherVal: string};
    const fields: MessageFieldDef[] = [
        [2, "otherVal", FieldTypes.string],
        [13, "strVal", FieldTypes.string],
    ]
    const msgField = createMessage<Msg>(fields);

    it('throws for non-enumerable fields', () => {
        expect(() => {
            const m = createMessage<Msg>({} as any);
            m.readValue(fromHex(``));
        }).toThrow();
    })
    
    it('has undefined for a default', () => {
        expect(msgField.defVal()).toBe(undefined);
    })
    
    it('has all of the expected parts', () => {
        expect(msgField.readValue).toBeDefined();
        expect(msgField.read).toBeDefined();
    })

    // consider merging createMessage() and define() sections
    test.todo('test write functions of message');

    it('can read an empty message', () => {
        const r = fromHex(``);
        const value = msgField.readValue(r);
        expect(value.strVal).toBe("");
    })

    it('can read a populated message', () => {
        const r = fromHex(`6a09646f632062726f776e`);
        const value = msgField.readValue(r);
        expect(value.strVal).toBe("doc brown");
    })

    it('can dump correct json', () => {
        const r = fromHex(`6a09646f632062726f776e`);
        const value = msgField.readValue(r);
        expect(JSON.stringify(value)).toBe(`{"otherVal":"","strVal":"doc brown"}`);
    })

    it('handles unknown fields', () => {
        const r = fromHex(`0a07756e6b6e6f776e6a09646f632062726f776e`);
        const value = msgField.readValue(r);
        expect(value.strVal).toBe("doc brown");
        expect(JSON.stringify(value)).toBe(`{"otherVal":"","strVal":"doc brown"}`);
    })

    it('throws on bad wire types of fields', () => {
        const r = fromHex(`102a6a09646f632062726f776e`);
        expect(() => { msgField.readValue(r); }).toThrow(/invalid wire type/i);
    })

    it('can do delimited reads', () => {
        const r = fromHex(`0b6a09646f632062726f776e`);
        const value = msgField.read(r, WireType.LengthDelim, 1, () => msgField.defVal());
        if (value instanceof Error)
            fail(value);
        expect(value.strVal).toBe("doc brown");
    })

    it('returns error for bad wire type of whole message', () => {
        const r = fromHex(`0b6a09646f632062726f776e`);
        const value = msgField.read(r, WireType.Varint, 1, () => msgField.defVal());
        expect(value).toEqual(new Error("Invalid wire type for message: 0"));
    })

    it('can be repeated', () => {
        const repeated = FieldTypes.repeated(msgField);
        // Note: this stream is missing the tags, we'll just simulate them
        //       we don't need a field number for the repeated itself
        //       and we know the wire type will be LengthDelim
        const r = fromHex(`0b6a09646f632062726f776e 076a056d61727479`);
        let value = repeated.defVal();
        let result = repeated.read(r, WireType.LengthDelim, 1, () => value);
        if (result instanceof Error)
            fail(result);
        value = result;
        expect(value.length).toBe(1);
        expect(value[0].strVal).toBe("doc brown");
        result = repeated.read(r, WireType.LengthDelim, 1, () => value);
        if (result instanceof Error)
            fail(result);
        value = result;
        expect(value.length).toBe(2);
        expect(value[0].strVal).toBe("doc brown");
        expect(value[1].strVal).toBe("marty");
    })

    it('can be merged from multiple instances of a field', () => {
        const r = fromHex(`0b6a09646f632062726f776e 0a120864656c6f7265616e`);
        let value: Msg | undefined = msgField.defVal();
        let result = msgField.read(r, WireType.LengthDelim, 1, () => value);
        if (result instanceof Error)
            fail(result);
        expect(result.strVal).toBe("doc brown");
        expect(result.otherVal).toBe("");
        value = result;
        result = msgField.read(r, WireType.LengthDelim, 1, () => value);
        if (result instanceof Error)
            fail(result);
        // now the results should have merged; the new field should be populated
        expect(result.otherVal).toBe("delorean");
        // and the old field should also still be populated
        // if the following is an empty string, it means that this probably ignored the previous value and started over
        expect(result.strVal).toBe("doc brown");
    })
})

