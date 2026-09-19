import { createFileRoute } from "@tanstack/react-router";

import { boardSeo } from "@/lib/seo";

export const Route = createFileRoute("/board/$aesthetic")({
  head: ({ params }) => {
    const { meta, links } = boardSeo({ aesthetic: params.aesthetic });
    return { meta: [...meta], links: [...links] };
  },
  component: () => <main className="p-8">Aesthetic board</main>,
});
