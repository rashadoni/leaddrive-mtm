module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // WatermelonDB requires legacy decorators — must be listed BEFORE class-properties
    ['@babel/plugin-proposal-decorators', {legacy: true}],
  ],
};
