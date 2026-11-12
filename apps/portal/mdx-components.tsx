import type { MDXComponents } from "mdx/types";

// Estilo de los artículos con los tokens de la marca (ninguna app define colores propios). Sin dependencias de tipografía.
// Los enlaces externos abren sin pasar la referencia; los internos son enlaces normales.
const components: MDXComponents = {
  h2: (p) => <h2 {...p} className="display mt-10 text-2xl sm:text-3xl" />,
  h3: (p) => <h3 {...p} className="display mt-8 text-xl" />,
  p: (p) => <p {...p} className="mt-4 text-lg leading-relaxed" />,
  ul: (p) => <ul {...p} className="mt-4 list-disc space-y-2 pl-6 text-lg" />,
  ol: (p) => <ol {...p} className="mt-4 list-decimal space-y-2 pl-6 text-lg" />,
  blockquote: (p) => <blockquote {...p} className="mt-6 border-l-4 border-accent bg-paper2 px-4 py-3 text-ink2" />,
  a: ({ href = "", ...p }) => {
    const externo = /^https?:\/\//.test(href);
    return <a href={href} {...p} className="text-accent underline underline-offset-4" {...(externo ? { rel: "noopener noreferrer", target: "_blank" } : {})} />;
  },
  code: (p) => <code {...p} className="mono bg-paper2 px-1 text-[0.9em]" />,
  pre: (p) => <pre {...p} className="mono mt-4 overflow-x-auto border border-rule bg-paper2 p-4 text-sm" />,
  hr: () => <hr className="my-8 border-rule" />,
  table: (p) => (
    <div className="mt-6 overflow-x-auto">
      <table {...p} className="w-full border-collapse text-left text-base" />
    </div>
  ),
  th: (p) => <th {...p} className="border-b-2 border-ink px-3 py-2 font-semibold" />,
  td: (p) => <td {...p} className="border-b border-rule px-3 py-2" />,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
