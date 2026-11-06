import SwiftUI

public struct PersonaSwitcherBar: View {
    @Binding var selectedPersona: TeamPersona
    public init(selectedPersona: Binding<TeamPersona>) { _selectedPersona = selectedPersona }
    public var body: some View {
        ScrollView(.horizontal) {
            HStack {
                ForEach(TeamPersona.demoPersonas) { persona in
                    Button { selectedPersona = persona } label: {
                        VStack(spacing: 3) {
                            Text("\(persona.emoji) \(persona.name)").bold()
                            Text(persona.role.rawValue).font(.caption2)
                        }.padding(.horizontal, 12).padding(.vertical, 8)
                            .background(selectedPersona.id == persona.id ? .orange.opacity(0.25) : .white.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
                    }.buttonStyle(.plain)
                        .accessibilityLabel("\(persona.name), \(persona.role.rawValue)")
                        .accessibilityAddTraits(selectedPersona.id == persona.id ? .isSelected : [])
                }
            }
        }.scrollIndicators(.hidden).padding(.horizontal).padding(.vertical, 6)
    }
}
