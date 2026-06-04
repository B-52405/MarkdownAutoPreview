const vscode = require('vscode');

/** @type {vscode.Uri | null} 当前关联预览的 Markdown 文件 URI，用于追踪状态 */
let activeMdUri = null;

/** 防重入锁：防止 showTextDocument 回调焦点时触发死循环 */
let isOpeningPreview = false;

/**
 * 关闭 Markdown 预览标签页
 * 直接遍历所有标签页组找到预览标签页并关闭（兼容左侧组已空只剩预览的场景）
 */
async function closeMarkdownPreview() {
	const allTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
	for (const tab of allTabs) {
		const input = /** @type {any} */ (tab.input);
		if (!input || typeof input !== 'object') continue;
		// VS Code 内部 markdown 预览的 viewType 为 'mainThreadWebview-markdown.preview'
		// 使用 includes 而非精确匹配以确保兼容性
		if (input.viewType && input.viewType.includes('markdown')) {
			await vscode.window.tabGroups.close(tab);
			return;
		}
	}
	// 兜底：如果通过 viewType 找不到，尝试用 closeEditorsInOtherGroups
	await vscode.commands.executeCommand('workbench.action.closeEditorsInOtherGroups');
}

/**
 * 在右侧打开 Markdown 预览，并保持焦点在 MD 源文件
 * @param {vscode.TextDocument} document
 */
async function openPreviewToSide(document) {
	if (isOpeningPreview) return;
	isOpeningPreview = true;
	activeMdUri = document.uri;
	await vscode.commands.executeCommand('markdown.showPreviewToSide', document.uri);
	// 确保焦点回到左侧的 MD 源文件（指定 ViewColumn.One 避免被打开到右侧栏）
	await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
	isOpeningPreview = false;
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('MD Side-by-Side Preview extension activated');

	// 监听活动编辑器切换（已覆盖首次打开 MD 的场景，无需额外监听 onDidOpenTextDocument）
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(async (editor) => {
			if (isOpeningPreview) return;
			if (editor && editor.document.languageId === 'markdown') {
				// MD 文件获得焦点 → 打开/刷新预览
				await openPreviewToSide(editor.document);
			} else if (activeMdUri && editor) {
				// 焦点离开 MD 文件且切换到了其他文本编辑器 → 关闭预览
				// editor 为 undefined 时不关闭（如用户点击了预览 webview 本身）
				await closeMarkdownPreview();
				activeMdUri = null;
			}
		})
	);

	// 监听 MD 文件关闭，同步关闭预览并清理状态
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument(async (document) => {
			if (document.languageId === 'markdown' && activeMdUri &&
				document.uri.toString() === activeMdUri.toString()) {
				await closeMarkdownPreview();
				activeMdUri = null;
			}
		})
	);

	// 如果激活时已有一个活动的 MD 编辑器，立即打开预览
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor && activeEditor.document.languageId === 'markdown') {
		openPreviewToSide(activeEditor.document);
	}
}

function deactivate() {
	activeMdUri = null;
}

module.exports = {
	activate,
	deactivate
}
