// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Compliment } from "@/lib/celebrities/compliment";

import {
  AUTO_OPEN_DELAY_MS,
  ComplimentDialog,
  ComplimentRow,
  initialsOf,
  useAutoOpen,
} from "./compliment-dialog";

const credited: Compliment = {
  tier: "above",
  lang: "en",
  line: "More beautiful than Anne Hathaway. Not even close.",
  celebrity: {
    name: "Anne Hathaway",
    photo: "/celebrities/anne-hathaway.webp",
    credit: {
      author: "Jane Doe",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
    },
  },
};

const vietnamese: Compliment = {
  tier: "league",
  lang: "vi",
  line: "Ngang ngửa Dương Gió Tai luôn, ra đường cẩn thận bị xin chữ ký!",
  celebrity: { name: "Dương Gió Tai", photo: null, credit: null },
};

describe("initialsOf", () => {
  it.each([
    ["Trấn Thành", "TT"],
    ["Dương Gió Tai", "DG"],
    ["Độ Mixi", "ĐM"],
    ["V (BTS)", "V"],
    ["Lisa (BLACKPINK)", "L"],
    ["Cô Phương Hằng", "CP"],
    ["Rihanna", "R"],
    ["Ánh Viên".normalize("NFD"), "ÁV"],
    ["", "?"],
  ])("%s gives %s", (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

describe("ComplimentDialog", () => {
  it("shows the photo, the credit and the line as the dialog's name", () => {
    render(<ComplimentDialog compliment={credited} open onOpenChange={() => {}} />);

    expect(
      screen.getByRole("dialog", { name: /More beautiful than Anne Hathaway/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Anne Hathaway" })).toHaveAttribute(
      "src",
      "/celebrities/anne-hathaway.webp",
    );
    expect(screen.getByRole("link", { name: "Jane Doe · Wikimedia Commons" })).toHaveAttribute(
      "href",
      "https://commons.wikimedia.org/wiki/File:Example.jpg",
    );
    expect(screen.getByRole("button", { name: "Thanks, I know 😎" })).toBeInTheDocument();
  });

  it("links the licence and says the photo was cropped, as CC BY and BY-SA require", () => {
    render(<ComplimentDialog compliment={credited} open onOpenChange={() => {}} />);

    expect(screen.getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0",
    );
    expect(screen.getByText(/cropped/)).toBeInTheDocument();
  });

  it("shows a licence without a link when Commons gave none", () => {
    const publicDomain: Compliment = {
      ...credited,
      celebrity: {
        ...credited.celebrity,
        credit: { ...credited.celebrity.credit!, licence: "Public domain", licenceUrl: null },
      },
    };
    render(<ComplimentDialog compliment={publicDomain} open onOpenChange={() => {}} />);

    expect(screen.getByText(/Public domain/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Public domain" })).toBeNull();
  });

  it("falls back to an initials badge when the photo fails to load", () => {
    render(<ComplimentDialog compliment={credited} open onOpenChange={() => {}} />);

    fireEvent.error(screen.getByRole("img", { name: "Anne Hathaway" }));

    expect(screen.getByRole("img", { name: "Anne Hathaway" })).toHaveTextContent("AH");
  });

  it("speaks Vietnamese, with an initials badge, to the vn Audience", () => {
    render(<ComplimentDialog compliment={vietnamese} open onOpenChange={() => {}} />);

    const dialog = screen.getByRole("dialog", { name: /Ngang ngửa Dương Gió Tai/ });
    expect(dialog).toHaveAttribute("lang", "vi");
    expect(screen.getByRole("img", { name: "Dương Gió Tai" })).toHaveTextContent("DG");
    expect(screen.getByRole("button", { name: "Biết rồi mà 😎" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("asks to close from its button", () => {
    const onOpenChange = vi.fn();
    render(<ComplimentDialog compliment={credited} open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Thanks, I know 😎" }));

    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
  });
});

describe("ComplimentRow", () => {
  it("reopens the pop-up from the row under the Overall", () => {
    const onOpen = vi.fn();
    render(<ComplimentRow compliment={credited} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: /More beautiful than Anne Hathaway/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("useAutoOpen", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens once the results have landed, not before", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAutoOpen(credited, false));

    act(() => vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS - 1));
    expect(result.current[0]).toBe(false);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBe(true);
  });

  it("opens without the delay under reduced motion", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAutoOpen(credited, true));

    act(() => vi.advanceTimersByTime(0));

    expect(result.current[0]).toBe(true);
  });

  it("opens once per result: closing sticks, even when the motion preference settles late", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ trigger, reduced }: { trigger: Compliment | null; reduced: boolean }) =>
        useAutoOpen(trigger, reduced),
      { initialProps: { trigger: credited, reduced: false } },
    );
    act(() => vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS));
    act(() => result.current[1](false));

    rerender({ trigger: credited, reduced: true });
    act(() => vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS));
    expect(result.current[0]).toBe(false);

    rerender({ trigger: { ...vietnamese }, reduced: false });
    act(() => vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS));
    expect(result.current[0]).toBe(true);
  });

  it("never opens without a Compliment", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAutoOpen(null, false));

    act(() => vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS * 2));

    expect(result.current[0]).toBe(false);
  });
});
