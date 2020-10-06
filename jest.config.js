module.exports = {
	coverageProvider: 'v8',
	displayName: 'unit test',
	preset: 'ts-jest',
	testEnvironment: 'node',
	testRunner: 'jest-circus/runner',
	testMatch: ['<rootDir>/packages/**/tests/*.test.ts', '<rootDir>/packages/**/tests/*.test.js'],
	globals: {
		'ts-jest': {
			tsConfig: '<rootDir>/tests/tsconfig.json'
		}
	}
};
