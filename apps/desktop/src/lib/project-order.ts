import { arrayMove } from "@dnd-kit/sortable";
import type { Project } from "@/store";

export function moveProject(
  projects: Project[],
  activeId: string,
  overId: string,
): Project[] {
  if (activeId === overId) return projects;
  const activeIndex = projects.findIndex((project) => project.id === activeId);
  const overIndex = projects.findIndex((project) => project.id === overId);
  if (activeIndex < 0 || overIndex < 0) return projects;
  return arrayMove(projects, activeIndex, overIndex);
}

export function moveProjectBy(
  projects: Project[],
  id: string,
  direction: -1 | 1,
): Project[] {
  const currentIndex = projects.findIndex((project) => project.id === id);
  const nextIndex = currentIndex + direction;
  if (
    currentIndex < 0 ||
    nextIndex < 0 ||
    nextIndex >= projects.length
  ) {
    return projects;
  }
  return arrayMove(projects, currentIndex, nextIndex);
}
