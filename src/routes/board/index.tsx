import { createFileRoute } from "@tanstack/react-router";

import { boardSeo } from "@/lib/seo";

export const Route = createFileRoute("/board/")({
  head: () => {
    const { meta, links } = boardSeo();
    return { meta: [...meta], links: [...links] };
  },
  component: () => <main className="p-8">Leaderboard</main>,
});
