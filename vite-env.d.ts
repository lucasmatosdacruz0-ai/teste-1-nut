// FIX: Removed `/// <reference types="vite/client" />`
// This line was causing a "Cannot find type definition file" error.
// Since no files appear to use Vite-specific client types like `import.meta.env`,
// removing it is the safest fix without access to the project's tsconfig.json.
