import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Permission } from "@erp/contracts";
import { PermissionMatrix } from "./permission-matrix";

const CATALOG: Permission[] = [
  "iam.user.manage",
  "iam.user.force_logout",
  "iam.role.manage",
  "hr.salary.view",
  "hr.salary.edit",
  "production.scan",
];

describe("PermissionMatrix", () => {
  it("groups the catalog by module and shows the granted cells as checked", () => {
    render(<PermissionMatrix catalog={CATALOG} value={["iam.user.manage"]} onChange={() => {}} />);

    expect(screen.getByText("iam")).toBeInTheDocument();
    const managerCheckbox = screen.getByRole("checkbox", { name: "iam.user.manage" });
    expect(managerCheckbox).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "iam.role.manage" })).not.toBeChecked();
  });

  it("keeps hr.salary.* out of the main grid and renders it as a captioned toggle", () => {
    render(<PermissionMatrix catalog={CATALOG} value={[]} onChange={() => {}} />);

    // Not rendered as a grid checkbox...
    expect(screen.queryByRole("checkbox", { name: "hr.salary.view" })).not.toBeInTheDocument();
    // ...only as a switch below the grid.
    expect(screen.getByRole("switch", { name: "hr.salary.view" })).toBeInTheDocument();
    expect(screen.getByText(/Salary & cost visibility/)).toBeInTheDocument();
  });

  it("handles the two-segment production.scan exception as its own row", () => {
    render(<PermissionMatrix catalog={CATALOG} value={[]} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "production.scan" })).toBeInTheDocument();
  });

  it("toggling a cell calls onChange with the new set", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PermissionMatrix catalog={CATALOG} value={["iam.user.manage"]} onChange={onChange} />);

    await user.click(screen.getByRole("checkbox", { name: "iam.role.manage" }));
    expect(onChange).toHaveBeenCalledWith(["iam.user.manage", "iam.role.manage"]);
  });

  it("collapsing a group hides its rows", async () => {
    const user = userEvent.setup();
    render(<PermissionMatrix catalog={CATALOG} value={[]} onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Collapse iam" }));
    expect(screen.queryByRole("checkbox", { name: "iam.user.manage" })).not.toBeInTheDocument();
  });

  it("blocks removing the last permission of a system role", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PermissionMatrix
        catalog={CATALOG}
        value={["iam.user.manage"]}
        onChange={onChange}
        isSystemRole
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "iam.user.manage" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/must keep at least one permission/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "iam.user.manage" })).toBeChecked();
  });

  it("shows the live affects-N caption only once the selection is dirty", () => {
    const { rerender } = render(
      <PermissionMatrix
        catalog={CATALOG}
        value={["iam.user.manage"]}
        initialValue={["iam.user.manage"]}
        onChange={() => {}}
        affectedUserCount={5}
      />,
    );
    expect(screen.queryByText(/affect 5 active users/)).not.toBeInTheDocument();

    rerender(
      <PermissionMatrix
        catalog={CATALOG}
        value={["iam.user.manage", "iam.role.manage"]}
        initialValue={["iam.user.manage"]}
        onChange={() => {}}
        affectedUserCount={5}
      />,
    );
    expect(screen.getByText(/affect 5 active users/)).toBeInTheDocument();
  });
});
