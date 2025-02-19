import {
	TreeDataProvider,
	TreeItem,
	ThemeIcon,
	ExtensionContext,
	TreeItemCollapsibleState,
	Uri,
	EventEmitter,
	Command,
} from "vscode";
import { inject, injectable } from "inversify";

import { TYPES } from "../../container/types";
import {
	compareFileTreeNode,
	getDiffUriPair,
	rebuildUri,
} from "../../git/utils";
import { EXTENSION_SCHEME } from "../../constants";
import {
	FileNode,
	FolderNode,
	PathCollection,
	PathType,
} from "../../git/changes/tree";

@injectable()
export class ChangeTreeDataProvider implements TreeDataProvider<TreeItem> {
	private _onDidChangeTreeData = new EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(
		@inject(TYPES.ExtensionContext) private context: ExtensionContext
	) {}

	getTreeItem(element: Path) {
		return element;
	}

	getChildren(element?: Path) {
		// TODO: order by type and name
		return Promise.resolve(
			Object.entries(
				element
					? (element.children as PathCollection)!
					: rebuildUri(
							this.context.globalState.get<PathCollection>(
								"changedFileTree"
							)
					  )!
			)
				.sort(compareFileTreeNode)
				.map(([name, props]) => new Path(name, props))
		);
	}

	refresh() {
		this._onDidChangeTreeData.fire();
	}
}

class Path extends TreeItem {
	children?: PathCollection = (this.props as FolderNode).children;
	iconPath = ThemeIcon[this.props.type];
	resourceUri = this.getResourceUri();
	collapsibleState = this.getCollapsibleState();
	readonly command?: Command = this.getCommand();

	constructor(public label: string, public props: FolderNode | FileNode) {
		super(label);
	}

	private getResourceUri() {
		if (this.props.type === PathType.FILE) {
			const { uri } = this.props;
			return uri.with({
				scheme: EXTENSION_SCHEME,
				query: JSON.stringify({ status: this.props.status }),
			});
		}

		if (this.props.type === PathType.FOLDER) {
			return Uri.file(this.label);
		}
	}

	private getCollapsibleState() {
		const { type } = this.props;
		const STATE_MAP = {
			[PathType.FOLDER]: TreeItemCollapsibleState.Expanded,
			[PathType.FILE]: TreeItemCollapsibleState.None,
		};

		return STATE_MAP[type];
	}

	private getCommand() {
		if (this.props.type === PathType.FILE) {
			const diffUris = getDiffUriPair(this.props);

			if (diffUris.length === 1) {
				return {
					title: "Open",
					command: "vscode.open",
					arguments: [diffUris[0]],
				};
			} else if (diffUris.length === 2) {
				return {
					title: "diff",
					command: "vscode.diff",
					arguments: getDiffUriPair(this.props),
				};
			}
		}
	}
}
