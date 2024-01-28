import {WriteField as write, Writer} from "../src/protobuf-codec-ts";

const {allocateNestingWriter, arrayCollector} = Writer;

test('example code in readme', () => {
    const myNumber = 42;
    const myNumber_field = 1;

    const myString = "The ultimate answer";
    const myString_field = 2;

    // Preallocate a buffer
    const writer = allocateNestingWriter(1024);

    // Write the fields to the buffer
    write.int32(writer, myNumber, myNumber_field);
    write.string(writer, myString, myString_field);

    // and then get the resulting blob
    const encoded = writer.finish(arrayCollector);
})