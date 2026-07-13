import { render, screen } from "@testing-library/react";
import { Avatar } from "./avatar";

describe("Avatar", () => {
  it("shows initials when there is no image", async () => {
    render(<Avatar name="Somchai P." initials="SP" />);
    expect(await screen.findByText("SP")).toBeInTheDocument();
  });
});
