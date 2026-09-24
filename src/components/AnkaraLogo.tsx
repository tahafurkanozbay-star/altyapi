interface Props {
  className?: string;
  decorative?: boolean;
  alt?: string;
}

export function AnkaraLogo({ className = "", decorative = false, alt = "Ankara Büyükşehir Belediyesi logosu" }: Props) {
  const classes = ["ankara-logo-image", className].filter(Boolean).join(" ");
  return (
    <img
      className={classes}
      src="./ankara-logo.png"
      alt={decorative ? "" : alt}
      aria-hidden={decorative ? true : undefined}
      draggable={false}
      decoding="async"
    />
  );
}
