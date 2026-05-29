EAPI=8

inherit desktop unpacker xdg

DESCRIPTION="Your Notes, Your Thoughts; Your Tangent (binary linux-unpacked repack)"
HOMEPAGE="https://github.com/visrosa/Tangent"
MY_PV="${PV/_beta/-beta.}"
SRC_URI="
	https://github.com/visrosa/Tangent/releases/download/v${MY_PV}/tangent-beta-${MY_PV}-linux.tar.gz
		-> ${P}-linux.tar.gz
"
S="${WORKDIR}/linux-unpacked"

LICENSE="Apache-2.0"
SLOT="0"
KEYWORDS="~amd64"
RESTRICT="strip"

RDEPEND="
	virtual/electron
"

src_install() {
	insinto /usr/share/${PN}
	doins resources/app.asar || die "Missing resources/app.asar in linux-unpacked payload"

	newbin "${FILESDIR}/${PN}" tangent

	local desktop_file
	desktop_file="$(find . -maxdepth 6 -type f -name '*.desktop' | head -n1)"
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
	icon_file="$(find . -type f \( -name 'tangent.png' -o -name 'icon.png' -o -name '*256*.png' \) | head -n1)"
	if [[ -n "${icon_file}" ]]; then
		newicon "${icon_file}" tangent.png
	fi
}
