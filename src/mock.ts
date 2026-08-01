import type { PCloudAPI } from "./api.js"

// A pCloud account that does not exist, for screenshots, demos and tests.
//
// Every name here is invented. That is the point: the alternative is
// screenshotting a real drive, and a folder listing says more about someone
// than they usually intend — project names, client names, what they are
// working on and when.
//
// It is also the fixture the component tests use, so the data a screenshot
// shows and the data the tests assert against cannot drift apart.

const rfc = (iso: string) => new Date(iso).toUTCString()

const folder = (name: string, folderid: number) => ({
  name,
  isfolder: true,
  folderid,
  modified: rfc("2026-05-14T09:12:00Z"),
})

const file = (
  name: string,
  fileid: number,
  size: number,
  modified: string,
) => ({ name, isfolder: false, fileid, size, modified: rfc(modified) })

const TREE: Record<string, unknown[]> = {
  "/": [
    folder("Documents", 101),
    folder("Photos", 102),
    folder("Projects", 103),
    folder("Recipes", 104),
    file("README.md", 201, 2_048, "2026-07-31T18:20:00Z"),
    file("budget.numbers", 202, 184_320, "2026-07-28T11:05:00Z"),
  ],
  "/Documents": [
    folder("Invoices", 110),
    file("quarterly.pdf", 210, 1_048_576, "2026-07-30T16:44:00Z"),
    file("notes.md", 211, 4_096, "2026-07-31T08:15:00Z"),
    file("contract.docx", 212, 62_400, "2026-06-02T13:30:00Z"),
  ],
  "/Photos": [
    folder("2026", 120),
    file("sunset.jpg", 220, 3_355_443, "2026-07-12T19:40:00Z"),
    file("harbour.jpg", 221, 2_936_012, "2026-07-12T19:41:00Z"),
  ],
  "/Projects": [
    folder("website", 130),
    folder("newsletter", 131),
    file("roadmap.md", 230, 8_192, "2026-07-29T10:00:00Z"),
  ],
  "/Recipes": [file("bread.md", 240, 1_536, "2026-04-18T20:11:00Z")],
}

const CHANGES = [
  ["modifyfile", "2026-07-31T18:20:00Z", 201, "README.md", "/README.md"],
  ["modifyfile", "2026-07-31T17:55:00Z", 201, "README.md", "/README.md"],
  ["modifyfile", "2026-07-31T17:12:00Z", 201, "README.md", "/README.md"],
  [
    "createfile",
    "2026-07-31T08:15:00Z",
    211,
    "notes.md",
    "/Documents/notes.md",
  ],
  [
    "deletefile",
    "2026-07-30T22:04:00Z",
    250,
    "draft.md",
    "/Documents/draft.md",
  ],
  [
    "modifyfile",
    "2026-07-30T16:44:00Z",
    210,
    "quarterly.pdf",
    "/Documents/quarterly.pdf",
  ],
  [
    "createfolder",
    "2026-07-29T09:30:00Z",
    131,
    "newsletter",
    "/Projects/newsletter",
  ],
  [
    "deletefile",
    "2026-07-28T14:20:00Z",
    251,
    "old-logo.png",
    "/Photos/old-logo.png",
  ],
] as const

/**
 * A client backed by fixtures rather than the network. Reads return plausible
 * data; writes report success without doing anything, so a demo can be driven
 * end to end without an account.
 */
export const createMockAPI = (): PCloudAPI => {
  const ok = async () => ({ result: 0 })

  return {
    listFolder: async (path: string) => ({
      result: 0,
      metadata: {
        folderid: path === "/" ? 0 : 100,
        contents: TREE[path] ?? [],
      },
    }),

    listFolderById: async () => ({
      result: 0,
      metadata: { name: "Documents" },
    }),

    stat: async (path: string) => ({
      result: 0,
      metadata: TREE[path]
        ? { folderid: 100, isfolder: true, name: path.split("/").pop() }
        : { fileid: 201, isfolder: false, name: path.split("/").pop() },
    }),

    userInfo: async () => ({
      result: 0,
      email: "you@example.com",
      quota: 500_000_000_000,
      usedquota: 12_400_000_000,
      plan: 500,
      emailverified: true,
    }),

    diff: async () => ({
      result: 0,
      entries: CHANGES.map(([event, time, id, name, path], i) => ({
        diffid: 1000 + i,
        event,
        time: rfc(time),
        metadata: {
          [event.endsWith("folder") ? "folderid" : "fileid"]: id,
          name,
          path,
          parentfolderid: 0,
        },
      })),
    }),

    listShares: async () => ({
      result: 0,
      shares: {
        outgoing: [
          {
            shareid: 4021,
            folderid: 101,
            foldername: "Documents",
            tomail: "colleague@example.com",
            canread: true,
            canmodify: true,
            cancreate: true,
            candelete: false,
            created: rfc("2025-11-03T10:00:00Z"),
          },
          {
            shareid: 4022,
            folderid: 104,
            foldername: "Recipes",
            tomail: "friend@example.com",
            canread: true,
            canmodify: false,
            cancreate: false,
            candelete: false,
            created: rfc("2026-02-19T15:30:00Z"),
          },
        ],
        incoming: [
          {
            shareid: 4100,
            folderid: 900,
            foldername: "Team assets",
            frommail: "owner@example.com",
            canread: true,
            canmodify: true,
            cancreate: false,
            candelete: false,
            created: rfc("2026-01-08T09:00:00Z"),
          },
        ],
      },
      requests: { outgoing: [], incoming: [] },
    }),

    listTrash: async () => ({
      result: 0,
      contents: [
        {
          fileid: 250,
          name: "draft.md",
          size: 3_072,
          deletetime: 1_785_000_000,
        },
        { folderid: 140, name: "archive", size: 0 },
        {
          fileid: 251,
          name: "old-logo.png",
          size: 51_200,
          deletetime: 1_784_800_000,
        },
      ],
    }),

    listRevisions: async () => ({
      result: 0,
      revisions: [
        {
          revisionid: 98_765,
          size: 2_048,
          modified: rfc("2026-07-31T18:20:00Z"),
        },
        {
          revisionid: 98_701,
          size: 1_984,
          modified: rfc("2026-07-31T17:55:00Z"),
        },
        {
          revisionid: 98_640,
          size: 1_802,
          modified: rfc("2026-07-29T12:03:00Z"),
        },
      ],
    }),

    listPublinks: async () => ({
      result: 0,
      publinks: [
        { code: "XZdemo01", name: "quarterly.pdf", fileid: 210, downloads: 14 },
        {
          code: "XZdemo02",
          name: "Photos",
          folderid: 102,
          downloads: 3,
          expire: rfc("2026-12-31T23:59:00Z"),
        },
      ],
    }),

    getFileLink: async () => ({
      result: 0,
      hosts: ["example-host.pcloud.test"],
      path: "/demo/quarterly.pdf",
    }),

    getFilePublink: async () => ({
      result: 0,
      link: "https://example.test/publink/XZdemo01",
      code: "XZdemo01",
    }),

    // Writes succeed without doing anything, so a demo can be driven end to end.
    uploadFile: ok,
    deleteFile: ok,
    deleteFolder: ok,
    copyFile: ok,
    moveFile: ok,
    renameFile: ok,
    createFolder: ok,
    revertRevision: ok,
    restoreFromTrash: ok,
    restoreFolderFromTrash: ok,
    removeShare: ok,
    shareFolder: ok,
    acceptShare: ok,
    declineShare: ok,
    deletePublink: ok,
    request: ok,
  } as unknown as PCloudAPI
}

/** Sync pairs for the browser's Sync tab, one deliberately unhealthy. */
export const mockSyncPairs = () => [
  {
    id: 1,
    local: "~/pCloud/Documents",
    remote: "Documents",
    files: 412,
    queued: 0,
    issues: [],
  },
  {
    id: 2,
    local: "~/pCloud/Photos",
    remote: "Photos",
    files: 1_286,
    queued: 2,
    issues: ["2 queued operations with no destination"],
  },
  {
    id: 3,
    local: "~/pCloud/Projects",
    remote: "Projects",
    files: 97,
    queued: 0,
    issues: [],
  },
]

/** Client ignore rules for the browser's Settings tab. */
export const mockSettings = () => ({
  ignorePatterns: [
    ".DS_Store",
    "node_modules",
    ".git",
    "*.part",
    "*.photoslibrary",
  ],
  ignorePaths: ["/Applications", "/Library", "/System", "/usr"],
})
