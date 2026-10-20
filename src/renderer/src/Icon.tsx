const paths: Record<string, string> = {
  plus: 'M12 5v14M5 12h14', search: 'm20 20-4-4M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  note: 'M6 3h9l5 5v13H6zM15 3v5h5M9 12h7M9 16h7',
  folder: 'M3 6h7l2 2h9v11H3z', chevron: 'm9 6 6 6-6 6',
  trash: 'M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5',
  pin: 'm8 3 8 0M9 3v6l-3 4h12l-3-4V3M12 13v8',
  save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7',
  export: 'M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8',
  import: 'M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4',
  moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10',
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'
};
export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <svg className={`icon ${className}`} aria-hidden="true" viewBox="0 0 24 24"><path d={paths[name] || paths.note} /></svg>;
}
