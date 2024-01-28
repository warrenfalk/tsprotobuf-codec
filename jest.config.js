module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    modulePathIgnorePatterns: ["<rootDir>/dist/"],
    globals: {
        "ts-jest": {
            tsconfig: 'test/tsconfig.json',
            isolatedModules: true,
        },
    },
};
