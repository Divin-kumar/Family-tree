# Kinfolk

A local family history app with an interactive graph, people directory, profile photos, notes, relationship editing, search, JSON backup/import, and session undo (Ctrl/Cmd+Z).

## Run

Requires Node.js 24 or later. No dependency installation is needed.

```sh
npm start
```

Open http://localhost:3000. Run `npm test` for relationship validation tests.

Records are stored in `data/family.sqlite`, which is excluded from Git. The server listens on loopback only. This version is intended for a single user on this computer; it does not include accounts or remote collaboration. Export family backups regularly, including before importing another family. Photos are included in the backup. Browser undo history lasts for the current session.

Large families use an all-generations overview and paginated people lists (48 per page). Individual branches are limited to 80 cards. Relationship indexes are rebuilt only when family data changes. Search covers all people; generation filters can be cleared with All people.

The relationship source of truth is a parent-to-child edge plus a symmetric partner edge. Siblings, half-siblings, stepparents, stepchildren, grandparents, and grandchildren are derived from those saved edges. Choose a person's gender as female or male; parent links then display Mother or Father automatically. A sole partner is suggested as a child's other parent only when no conflicting co-parent history exists; otherwise confirm a parent or leave them unknown. Adding a parent always creates the direct parent-to-child edge. Removing a partner link leaves parent links intact. Each change is built on a copy, validated as a whole, then saved as one family document. Validation rejects duplicates, self/ancestor cycles, ancestor partnerships, gender/parent-label mismatches, and known parent birth dates that are not before the child's birth date.

The ten-generation fictional sample is separate from SQLite family records; sample edits are saved in this browser's local storage. Use Return to my family to leave it. Sample validation and graph scalability checks are included in `npm test`.

Start with your own family or use the clearly labeled example family. Parent edges run from parent to child; partner relationships are undirected. Multiple partners and parents are supported for blended, adoptive, and other family structures. Birth dates are optional. The automatic graph layout places members by generation; particularly complex families may have crossing connections.
