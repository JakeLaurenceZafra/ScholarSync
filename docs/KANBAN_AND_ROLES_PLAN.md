# Kanban Board & Role Enhancements [APPROVED]

This document outlines the approved enhancements for SkyFlow and ScholarSync, focusing on task management and role-based UI customization.

## Status: Approved
**Date**: 2026-03-15
**Stakeholder**: User

---

## 1. Kanban Board Enhancements

### Task Hierarchy
- **Main Tasks**: Created by Advisers/Managers. These are "Absolute" tasks that cannot be edited or deleted by students.
- **Subtasks**: Created by students under Main Tasks or independently.

### Permissions
- **Students**: 403 Forbidden on `PUT` / `DELETE` for tasks flagged as `is_absolute`.
- **Feature Lockdown**: Students cannot access "Sheet Imports", "Organization Management", or "Global Analytics". 
- **Privacy Enforcement**: Students are restricted to seeing ONLY their assigned teams. They cannot view or interact with other teams within the organization.
- **Load Balancing**: The WBS includes a **Complexity/Weight** field. Advisers can use this to ensure that hard tasks and easy tasks are distributed fairly; students cannot reassign these "Absolute" tasks once imported.
- **Navigation**: The sidebar and Kanban board will hide management buttons (Import, Settings, New Project) for the student role.
- **UI**: Absolute tasks will feature a "Lock" icon and disabled action buttons for students.

---

## 2. Role-Based UI Themes

The SkyFlow UI will adapt its color palette based on the user's role in the organization. The themes are designed to be subtle and consistent with the core blue/cyan aesthetic.

### Admin: "Elite Indigo"
- **Focus**: Authority and Premium Feel.
- **Primary Colors**: Slate Blue (#475569) & Deep Indigo (#312e81).
- **Application**: Sidebar gradients, header icons, and admin-only dashboard widgets.

### Adviser: "Professional Teal"
- **Focus**: Academic Organization and Growth.
- **Primary Colors**: Emerald Tint (#10b981) & Steel Blue (#4682b4).
- **Application**: Progress bars, academic report headers, and consultation views.

### Student: "SkyFlow Classic"
- **Focus**: Focused Productivity.
- **Primary Colors**: Sky Blue (#2563eb) & Cyan (#0891b2).
- **Application**: The standard SkyFlow interface for daily task management.


- ## Add Darkmode that will sync with these colors 
---

## 3. ScholarSync Integration

### Consultation Progress Sync
- A background process or endpoint will calculate the completion percentage of tasks in SkyFlow.
- This data will be pushed to the `ss_consultations` table in ScholarSync to update the "Progress" field for teams.

## 4. WBS to Kanban Extraction

Advisers can import a custom-designed WBS (Work Breakdown Structure) template which automatically populates the Kanban board with set Main Tasks.

### Enhanced WBS Template Columns
1. **Feature/Module**: Logic grouping (e.g., "Authentication").
2. **Main Task**: The deliverable (Absolute/Locked) for students.
3. **Description**: Detailed context and scope.
4. **Acceptance Criteria**: Clear requirements for task completion.
5. **Priority**: High/Medium/Low mapping.
6. **Assignee**: Link via email to the student in SkyFlow.
7. **Estimate (Hrs)**: Planned effort for metrics.
8. **Due Date**: Fixed deadline for the task.
 
 ## New Reference Work Breakdown Structure (WBS) Template (KTMS-WBS)
  - Tasks
  - Assignee
  -  Date Started
  -  Date Ended
  -  Status
  
### Extraction Logic
- Advisers import the sheet via the "Import WBS" action on the Board.
- **Acceptance Criteria Enforcement**: Criteria are extracted into a Checklist. Students cannot mark a task as "Done" until all criteria are checked off.
- **Sample Template**: A "Download Sample WBS" button will be available to provide a pre-formatted .csv for the Adviser.
- The system validates student emails and creates "Absolute" tasks that students cannot delete or modify.

## Invitation method 
- Invitation through link generated through ScholarSync

