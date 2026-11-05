// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "DeskhandMobile",
    platforms: [
        .iOS(.v18),
        .macOS(.v15)
    ],
    products: [
        .library(name: "DeskhandMobile", targets: ["DeskhandMobile"])
    ],
    targets: [
        .target(
            name: "DeskhandMobile",
            path: ".",
            exclude: ["Package.swift"]
        )
    ]
)

