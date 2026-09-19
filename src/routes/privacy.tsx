import { createFileRoute } from "@tanstack/react-router";

import { privacySeo } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () => {
    const { meta, links } = privacySeo();
    return { meta: [...meta], links: [...links] };
  },
  component: () => <main className="p-8">Privacy</main>,
});
