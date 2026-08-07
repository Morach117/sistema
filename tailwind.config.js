/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.php",
    "./views/**/*.php",
    "./api/**/*.php",
    "./assets/**/*.js"
  ],
  theme: {
    extend: {
      fontFamily: { 
        sans: ['Inter', 'sans-serif'] 
      },
      colors: {
        primary: '#FF69B4', 
        secondary: '#9333ea',
      }
    },
  },
  plugins: [
    require('daisyui'),
  ],
  daisyui: {
    themes: ["light", "dark"],
  },
}
