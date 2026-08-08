import { relations } from 'drizzle-orm'
import { projects } from './projects.schema'
import { tracks } from './tracks.schema'
import { segments } from './segments.schema'
import { markers } from './markers.schema'
import { editProjects } from './edit-projects.schema'
import { editOperations } from './edit-operations.schema'
import { exportJobs } from './export-jobs.schema'

export const projectsRelations = relations(projects, ({ many }) => ({
  tracks: many(tracks),
  markers: many(markers),
  editProjects: many(editProjects)
}))

export const tracksRelations = relations(tracks, ({ one, many }) => ({
  project: one(projects, { fields: [tracks.projectId], references: [projects.id] }),
  segments: many(segments)
}))

export const segmentsRelations = relations(segments, ({ one }) => ({
  track: one(tracks, { fields: [segments.trackId], references: [tracks.id] })
}))

export const markersRelations = relations(markers, ({ one }) => ({
  project: one(projects, { fields: [markers.projectId], references: [projects.id] })
}))

export const editProjectsRelations = relations(editProjects, ({ one, many }) => ({
  project: one(projects, { fields: [editProjects.projectId], references: [projects.id] }),
  operations: many(editOperations),
  exportJobs: many(exportJobs)
}))

export const editOperationsRelations = relations(editOperations, ({ one }) => ({
  editProject: one(editProjects, {
    fields: [editOperations.editProjectId],
    references: [editProjects.id]
  }),
  track: one(tracks, { fields: [editOperations.trackId], references: [tracks.id] })
}))

export const exportJobsRelations = relations(exportJobs, ({ one }) => ({
  editProject: one(editProjects, {
    fields: [exportJobs.editProjectId],
    references: [editProjects.id]
  })
}))
