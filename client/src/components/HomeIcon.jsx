const paths = {
  home: 'm3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9',
  hive: 'm12 3 8 4.5v9L12 21l-8-4.5v-9Z M12 3v9m8-4.5-8 4.5-8-4.5M12 12v9',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8m6 10v-2a4 4 0 0 0-3-3.87',
  calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z',
  message: 'M4 3h16v14H9l-5 4Z M8 8h8m-8 4h5',
  work: 'M3 7h18v14H3ZM8 7V3h8v4M3 12l9 3 9-3',
  save: 'M6 3h12v18l-6-4-6 4Z',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z',
  post: 'm15 3 6 6-12 12H3v-6ZM12 6l6 6',
  search: 'M21 21l-5-5',
  pulse: 'M2 12h5l3-8 4 16 3-8h5',
  like: 'M7 10v11H3V10Zm0 0 5-8a3 3 0 0 1 2 3l-1 5h6a2 2 0 0 1 2 2l-2 9H7',
  share: 'm14 3 7 7-7 7v-4C8 13 5 15 3 20c0-9 4-13 11-13Z',
};
export default function HomeIcon({ name, size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.hive} />{name === 'people' && <circle cx="9" cy="7" r="4" />}{name === 'search' && <circle cx="10" cy="10" r="7" />}{name === 'pin' && <circle cx="12" cy="10" r="2" />}</svg>;
}
