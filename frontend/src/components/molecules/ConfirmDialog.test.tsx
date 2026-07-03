import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./ConfirmDialog";

const baseProps = {
  open: true,
  title: "Delete facility",
  description: "This cannot be undone.",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe("ConfirmDialog", () => {
  it("renders the title and description when open", () => {
    render(<ConfirmDialog {...baseProps} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Delete facility")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
  });

  it("does not render its content when closed", () => {
    render(
      <ConfirmDialog
        {...baseProps}
        open={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByText("Delete facility")).not.toBeInTheDocument();
  });

  it("fires onConfirm when the action button is clicked", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        {...baseProps}
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("fires onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog {...baseProps} onConfirm={vi.fn()} onCancel={onCancel} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("uses a custom confirm label", () => {
    render(
      <ConfirmDialog
        {...baseProps}
        confirmLabel="Yes, remove"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: "Yes, remove" })
    ).toBeInTheDocument();
  });
});
