// Section order for the landing page. Each section is a standalone page in
// client/public/landing/sections/, shown in its own iframe (SectionFrame) so
// its CSS and JS can't collide with the rest of the app.
export const landingSections = [
  {
    id: '01',
    src: '/landing/sections/01-landing-hero-and-hive-showcase.html',
    title: 'Landing hero and Hive discovery showcase',
    label: 'Animated landing hero and Hive discovery showcase',
    background: '#050505',
    // The real site header (components/PublicHeader) is laid over this
    // section, so hide the section's own copy but keep the space it takes.
    injectCss: '.tinder-inspired-header{visibility:hidden}',
  },
  {
    id: '03',
    src: '/landing/sections/03-interactive-journey.html',
    title: 'The TrueHive experience — interactive journey',
    label: 'The TrueHive experience — interactive journey',
    background: '#100b09',
  },
  {
    id: '05',
    src: '/landing/sections/05-inside-your-hive.html',
    title: 'Inside your Hive interactive product demo',
    label: 'Inside your Hive interactive product demo',
    background: '#f7f3eb',
  },
  {
    id: '06',
    src: '/landing/sections/06-six-ways-to-connect.html',
    title: 'Six ways to connect',
    label: 'Six ways to connect',
    background: '#120d0a',
  },
  {
    id: '07',
    src: '/landing/sections/07-create-and-monetize.html',
    title: 'Create and monetize your Hive',
    label: 'Create and monetize your Hive interactive preview',
    background: '#100b09',
  },
  {
    id: '08',
    src: '/landing/sections/08-safety-and-trust.html',
    title: 'Safety and trust',
    label: 'Safety and Trust',
    background: '#f7f3eb',
  },
  {
    id: '09',
    src: '/landing/sections/09-real-connections/index.html',
    title: 'Real connections — illustrative stories',
    label: 'Real people, real stories, real impact',
    background: '#120b08',
  },
  {
    id: '10',
    src: '/landing/sections/10-final-experience/index.html',
    title: 'The final experience — find your Hive',
    label: 'Some connections change everything',
    background: '#0c090b',
    // Its cinematic entrance starts when the section first appears, so load
    // it only when the visitor scrolls near it.
    loadWhenVisible: true,
    placeholderHeight: 970,
  },
];
