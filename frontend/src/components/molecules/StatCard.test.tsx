import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatCard } from "./StatCard";

describe("StatCard", () => {
  it("renders the label and value", () => {
    render(<StatCard label="Active Referrals" value={42} />);
    expect(screen.getByText("Active Referrals")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders as a plain div (not a button) without onClick", () => {
    render(<StatCard label="Beds" value="7" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("becomes a clickable button and fires onClick", async () => {
    const onClick = vi.fn();
    render(<StatCard label="Pending" value={3} onClick={onClick} />);
    const button = screen.getByRole("button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
