import type { Meta, StoryObj } from "@storybook/react-vite";
import { TokenMatrix } from "./TokenMatrix";

/**
 * The foundation workbench story. Use the toolbar's Theme / Density / Locale switches to verify
 * the matrix: paper stays white in dark, rows reflow across densities, and Thai/Latin both set
 * cleanly — all via token re-resolution, no component variants.
 */
const meta = {
  title: "Foundation/Token Matrix",
  component: TokenMatrix,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TokenMatrix>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
