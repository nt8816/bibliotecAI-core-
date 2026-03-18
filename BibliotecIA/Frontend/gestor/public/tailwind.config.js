import rootConfig from '../../../../tailwind.config.js';

export default {
  ...rootConfig,
  content: [
    '../../../../pages/**/*.{js,jsx}',
    '../../../../components/**/*.{js,jsx}',
    '../../../../app/**/*.{js,jsx}',
    '../../../../src/**/*.{js,jsx}',
  ],
};
