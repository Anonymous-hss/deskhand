import SwiftUI

public struct PersonaSwitcherBar: View {
    @Binding var selectedPersona: TeamPersona

    public init(selectedPersona: Binding<TeamPersona>) {
        self._selectedPersona = selectedPersona
    }

    public var body: some View {
        HStack(spacing: 8) {
            ForEach(TeamPersona.demoPersonas) { persona in
                let isSelected = persona.id == selectedPersona.id
                Button {
                    selectedPersona = persona
                } label: {
                    HStack(spacing: 4) {
                        Text(persona.emoji)
                        Text(persona.name)
                            .font(.caption.bold())
                        Text("(\(persona.role.rawValue))")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity)
                    .background(isSelected ? Color.orange.opacity(0.25) : Color.white.opacity(0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(isSelected ? Color.orange : Color.clear, lineWidth: 1.5)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }
}

