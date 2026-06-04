const vscode = require('vscode');

/** @type {vscode.Uri | null} 当前关联预览的 Markdown 文件 URI，用于追踪状态 */
let activeMdUri = null;

/** 防重入锁：防止 showTextDocument 回调焦点时触发死循环 */
let isOpeningPreview = false;

/**
 * 关闭 Markdown 预览标签页
 * 使用内置命令关闭活动编辑器组之外的所有编辑器（即右侧预览窗口）
 */
async function closeMarkdownPreview() {
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

	// 监听 MD 文件关闭，清理状态
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument((document) => {
			if (document.languageId === 'markdown' && activeMdUri &&
				document.uri.toString() === activeMdUri.toString()) {
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
