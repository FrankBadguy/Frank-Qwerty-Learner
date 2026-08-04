module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      // 全站英文字体统一为 Georgia（粗体，见 index.css 中的 @font-face），
      // 中文回退到系统字体，字重不受影响
      fontFamily: {
        sans: ['GeorgiaEN', 'Georgia', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', '"Noto Sans SC"', 'sans-serif'],
        mono: ['GeorgiaEN', 'Georgia', 'Menlo', 'Monaco', 'Consolas', '"PingFang SC"', '"Microsoft YaHei"', 'monospace'],
        serif: ['GeorgiaEN', 'Georgia', '"Songti SC"', 'SimSun', 'serif'],
      },
      // 全站统一粗体：所有字重工具类都输出 700（英文由 GeorgiaEN 面固定 Georgia Bold，中文由系统按 700 匹配最粗可用字重）
      fontWeight: {
        thin: '700',
        extralight: '700',
        light: '700',
        normal: '700',
        medium: '700',
        semibold: '700',
        bold: '700',
        extrabold: '700',
        black: '700',
      },
      transitionDuration: {
        0: '0ms',
      },
      padding: {
        0.8: '0.2rem',
      },
      width: {
        3.5: '0.875rem',
        5.5: '1.375rem',
        15: '3.75rem',
        18: '4.5rem',
        70: '17.5rem',
        75: '18.75rem',
        84: '21rem',
        85: '21.25rem',
        100: '25rem',
        116: '29rem',
        150: '37.5rem',
        160: '40rem',
        200: '50rem',
      },
      height: {
        3.5: '0.875rem',
        5.5: '1.375rem',
        15: '3.75rem',
        18: '4.5rem',
        22: '5.5rem',
        112: '28rem',
        120: '30rem',
        152: '38rem',
      },
      borderWidth: {
        3: '3px',
      },
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
        dic3: '1100px',
        dic4: '1440px',
      },
    },
  },
  variants: {
    extend: {
      visibility: ['hover', 'group-hover'],
      textOpacity: ['dark'],
      backgroundOpacity: ['dark'],
    },
  },
  plugins: [require('@headlessui/tailwindcss'), require('@tailwindcss/forms')],
}
