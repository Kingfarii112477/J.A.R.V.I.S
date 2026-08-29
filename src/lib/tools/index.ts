import { registerBuiltinTools } from "./builtins";
import { registerDeviceTools } from "./deviceTools";

registerBuiltinTools();
registerDeviceTools();

export { toolRegistry } from "./registry";
export { executeTool, type ExecuteToolResult } from "./executor";
