import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./Pagination";

const setup = (overrides = {}) => {
  const props = {
    page: 1,
    pageSize: 10,
    total: 95,
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    ...overrides,
  };
  render(<Pagination {...props} />);
  return props;
};

describe("Pagination", () => {
  it("shows the current row range and total", () => {
    setup({ page: 2, pageSize: 10, total: 95 });
    // 95 items, page 2 of size 10 → rows 11–20.
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("computes the total number of pages", () => {
    setup({ page: 1, pageSize: 10, total: 95 });
    // ceil(95 / 10) = 10 pages.
    expect(screen.getByText("Page 1 of 10")).toBeInTheDocument();
  });

  it("disables Previous on the first page", () => {
    setup({ page: 1 });
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
  });

  it("disables Next on the last page", () => {
    setup({ page: 10, pageSize: 10, total: 95 });
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("requests the next page when Next is clicked", async () => {
    const props = setup({ page: 2 });
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(props.onPageChange).toHaveBeenCalledWith(3);
  });

  it("clamps an empty result set to a single page", () => {
    setup({ page: 1, pageSize: 10, total: 0 });
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });
});
