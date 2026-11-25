import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['node_modules/**', 'frontend/js/components/icons-data.js'] },
    js.configs.recommended,
    {
        files: ['backend/**/*.js', 'eslint.config.js'],
        languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    },
    {
        files: ['frontend/**/*.js'],
        languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.browser },
    },
    {
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
            'no-console': 'off',
        },
    },
];
