// Web environment - reads from process.env (injected by webpack DefinePlugin)
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || '';
