import { createFileRoute } from "@tanstack/react-router";

import { AestheticsCard } from "@/components/home/aesthetics-card";
import { AnimatedHeadline } from "@/components/home/animated-headline";
import { BoardCard } from "@/components/home/board-card";
import { UploadCard } from "@/components/home/upload-card";
import { getHomeData } from "@/server/home.functions";

export const Route = createFileRoute("/")({
  loader: () => getHomeData(),
  component: Home,
});

function Home() {
  const { board, aesthetics } = Route.useLoaderData();

  return (
    <main className="stage min-h-dvh px-4 py-10 sm:py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <AnimatedHeadline />
        <p className="text-muted-foreground -mt-4 text-center text-sm text-balance">
          Upload your image to get a Jev score. No cloud save until you claim it.
        </p>

        {/* The Crop stays here, in the browser, until a Claim. See SPEC.md, "Portraits". */}
        <UploadCard onCrop={() => {}} />

        <div className="grid gap-6 sm:grid-cols-2">
          <BoardCard rows={board} />
          <AestheticsCard bars={aesthetics} />
        </div>
      </div>
    </main>
  );
}
