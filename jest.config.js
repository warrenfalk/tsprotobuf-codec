module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    modulePathIgnorePatterns: ["<rootDir>/dist/"],
    transform: {
        "^.+\\.tsx?$": ["ts-jest", { isolatedModules: true}],
    },
};
