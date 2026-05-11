/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          base:    '#080e1c',   // 최하위 배경
          panel:   '#0c1322',   // 사이드바·패널
          card:    '#111827',   // 카드 표면
          raised:  '#162032',   // 약간 떠 있는 카드 (active)
          input:   '#0c1322',   // 인풋 배경
          overlay: '#1a2640',   // 팝오버·드롭다운
        },
      },
      boxShadow: {
        'card':         '0 2px 10px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05)',
        'card-active':  '0 4px 20px rgba(0,0,0,0.55), 0 0 0 1px rgba(59,130,246,0.20)',
        'card-branch':  '0 2px 10px rgba(0,0,0,0.4),  0 0 0 1px rgba(234,88,12,0.18)',
        'card-hover':   '0 4px 16px rgba(0,0,0,0.5),  0 0 0 1px rgba(255,255,255,0.08)',
      },
      borderRadius: {
        sm:  '6px',
        md:  '10px',
        lg:  '14px',
        xl:  '18px',
        '2xl': '24px',
      },
    },
  },
  plugins: [],
}
