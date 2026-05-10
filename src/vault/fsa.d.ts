// Minimal File System Access API declarations.
// TS DOM lib coverage is incomplete in some toolchains — declare the surface we use.

export {}

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite'
  }

  interface FileSystemHandle {
    queryPermission?(desc?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
    requestPermission?(desc?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  }

  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>
    values(): AsyncIterableIterator<FileSystemHandle>
    keys(): AsyncIterableIterator<string>
  }

  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: 'read' | 'readwrite'
      id?: string
      startIn?: string | FileSystemHandle
    }) => Promise<FileSystemDirectoryHandle>
  }
}
