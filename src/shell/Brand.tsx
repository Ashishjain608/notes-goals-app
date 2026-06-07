/** The app mark: an italic serif ampersand in a soft rounded tile. */
export function Brand({ small = false }: { small?: boolean }): JSX.Element {
  const size = small ? 30 : 34;
  return (
    <div
      className="grid shrink-0 place-items-center border border-line bg-surface shadow-sm"
      style={{ width: size, height: size, borderRadius: 9 }}
    >
      <span
        className="font-serif italic leading-none text-accent"
        style={{ fontSize: small ? 17 : 19, marginTop: -1 }}
      >
        &amp;
      </span>
    </div>
  );
}
