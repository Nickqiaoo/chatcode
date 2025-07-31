import { Markup } from 'telegraf';
import { MESSAGES } from '../../../constants/messages';
import { Project } from '../../../models/project';

export class KeyboardFactory {
  static createProjectTypeKeyboard(): any {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(MESSAGES.BUTTONS.GITHUB_REPO, 'project_type_github'),
        Markup.button.callback(MESSAGES.BUTTONS.LOCAL_DIRECTORY, 'project_type_directory'),
      ],
      [
        Markup.button.callback(MESSAGES.BUTTONS.CANCEL, 'cancel'),
      ],
    ]);
  }

  static createCancelKeyboard(): any {
    return Markup.inlineKeyboard([
      Markup.button.callback(MESSAGES.BUTTONS.CANCEL, 'cancel'),
    ]);
  }

  static createCompletionKeyboard(): any {
    return Markup.keyboard([
      ['/clear', '/abort']
    ]).resize();
  }

  static createProjectListKeyboard(projects: Project[]): any {
    const keyboard = [];
    
    // Add project buttons, 2 per row
    for (let i = 0; i < projects.length; i += 2) {
      const row = [];
      const project1 = projects[i];
      const project2 = projects[i + 1];
      
      if (project1) {
        row.push(Markup.button.callback(
          `${project1.type === 'git' ? '🔗' : '📂'} ${project1.name}`,
          `project_select_${project1.id}`
        ));
      }
      
      if (project2) {
        row.push(Markup.button.callback(
          `${project2.type === 'git' ? '🔗' : '📂'} ${project2.name}`,
          `project_select_${project2.id}`
        ));
      }
      
      if (row.length > 0) {
        keyboard.push(row);
      }
    }
    
    // Add action buttons
    keyboard.push([
      Markup.button.callback('❌ cancel', 'cancel')
    ]);
    
    return Markup.inlineKeyboard(keyboard);
  }

  static createDirectoryKeyboard(browsingState: any): any {
    const { currentPage, itemsPerPage, totalItems, items } = browsingState;
    const keyboard = [];

    // Calculate pagination
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const pageItems = items.slice(startIndex, endIndex);

    // Add file/directory buttons (2 per row)
    for (let i = 0; i < pageItems.length; i += 2) {
      const row = [];
      const item1 = pageItems[i];
      const item2 = pageItems[i + 1];

      if (item1) {
        row.push(Markup.button.callback(
          `${item1.icon} ${item1.name}`,
          `${item1.type}:${encodeURIComponent(item1.name)}`
        ));
      }

      if (item2) {
        row.push(Markup.button.callback(
          `${item2.icon} ${item2.name}`,
          `${item2.type}:${encodeURIComponent(item2.name)}`
        ));
      }

      if (row.length > 0) {
        keyboard.push(row);
      }
    }

    // Add navigation buttons
    const navRow = [];
    if (currentPage > 1) {
      navRow.push(Markup.button.callback('⬅️ Previous', `nav:page:${currentPage - 1}`));
    }
    if (browsingState.currentPath !== '/') {
      navRow.push(Markup.button.callback('📂 Parent', 'nav:parent'));
    }
    if (currentPage < totalPages) {
      navRow.push(Markup.button.callback('Next ➡️', `nav:page:${currentPage + 1}`));
    }

    if (navRow.length > 0) {
      keyboard.push(navRow);
    }

    // Add action buttons
    keyboard.push([
      Markup.button.callback('🔄 Refresh', 'nav:refresh'),
      Markup.button.callback('❌ Close', 'nav:close')
    ]);

    return Markup.inlineKeyboard(keyboard);
  }
}