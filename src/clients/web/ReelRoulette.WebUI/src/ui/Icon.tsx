/** A Material Symbols icon, by its name, with any classes of its own after the icon's. */
export function Icon({ name, class: className }: { name: string; class?: string }) {
  return <span class={className ? `material-symbol-icon ${className}` : "material-symbol-icon"}>{name}</span>;
}
