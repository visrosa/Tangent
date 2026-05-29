EAPI=8

inherit desktop unpacker xdg

DESCRIPTION="Your Notes, Your Thoughts; Your Tangent (source build)"
HOMEPAGE="https://github.com/visrosa/Tangent"
MY_PV="${PV/_beta/-beta.}"
SRC_URI="
	https://github.com/visrosa/Tangent/releases/download/v${MY_PV}/tangent-${MY_PV}-source.tar.gz
		-> ${P}-source.tar.gz
	https://github.com/visrosa/Tangent/releases/download/v${MY_PV}/tangent-${MY_PV}-vendor.tar.zst
		-> ${P}-vendor.tar.zst
"
S="${WORKDIR}/tangent-${MY_PV}"

LICENSE="Apache-2.0"
SLOT="0"
KEYWORDS="~amd64"
RESTRICT="strip"

RDEPEND="
	virtual/electron
"
BDEPEND="
	net-libs/nodejs[npm]
	app-arch/zstd
"

src_unpack() {
	unpack "${P}-source.tar.gz"
	cd "${S}" || die
	tar --zstd -xf "${DISTDIR}/${P}-vendor.tar.zst" || die
}

src_compile() {
	mkdir -p "${T}/home" || die
	export HOME="${T}/home"
	export npm_config_cache="${S}/vendor/npm-cache"
	export npm_config_offline=true
	export npm_config_audit=false
	export npm_config_fund=false
	export npm_config_update_notifier=false
	export ELECTRON_CACHE="${S}/vendor/electron-cache"
	export ELECTRON_BUILDER_CACHE="${S}/vendor/electron-builder-cache"

	npm ci --workspaces --include-workspace-root --offline || die
	npm run build --workspace packages/tangent-query-parser || die
	npm run build --workspace packages/tangent-html-to-markdown || die
	npm run build --workspace lib/typewriter || die
	npm run build --workspace apps/tangent-electron || die
	npm exec --workspace apps/tangent-electron -- electron-builder --linux dir --x64 --publish never -c.linux.executableName=tangent || die
}

src_install() {
	insinto /usr/share/${PN}
	doins apps/tangent-electron/dist/linux-unpacked/resources/app.asar || die "Missing app.asar after source build"

	newbin "${FILESDIR}/${PN}" tangent

	local desktop_file
	desktop_file="$(find apps/tangent-electron/dist/linux-unpacked -type f -name '*.desktop' | head -n1)"
	if [[ -n "${desktop_file}" ]]; then
		sed \
			-e 's|^Exec=.*|Exec=tangent|g' \
			-e 's|^Icon=.*|Icon=tangent|g' \
			"${desktop_file}" > "${T}/tangent.desktop" || die
		domenu "${T}/tangent.desktop"
	else
		make_desktop_entry tangent Tangent tangent "Office;"
	fi

	local icon_file
	icon_file="$(find apps/tangent-electron/dist/linux-unpacked -type f \( -name 'tangent.png' -o -name 'icon.png' -o -name '*256*.png' \) | head -n1)"
	if [[ -n "${icon_file}" ]]; then
		newicon "${icon_file}" tangent.png
	fi
}
